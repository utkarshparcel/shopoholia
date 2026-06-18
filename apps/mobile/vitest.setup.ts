import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import React from 'react';
import { afterEach, vi } from 'vitest';

(globalThis as { __DEV__?: boolean }).__DEV__ = true;

afterEach(() => {
  cleanup();
});

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('div', props, children),
}));

vi.mock('@sentry/react-native', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
}));

const createComponent =
  (tag: string) =>
  ({ children, style, ...props }: React.PropsWithChildren<{ style?: unknown } & Record<string, unknown>>) => {
    const resolvedStyle = typeof style === 'function' ? style({ pressed: false }) : style;
    return React.createElement(tag, { ...props, style: resolvedStyle }, children);
  };

vi.mock('react-native', () => ({
  View: createComponent('div'),
  Text: createComponent('span'),
  ScrollView: createComponent('div'),
  Pressable: ({
    children,
    onPress,
    style,
    disabled,
    ...props
  }: React.PropsWithChildren<{
    onPress?: () => void;
    style?: unknown;
    disabled?: boolean;
    children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
  }>) => {
    const resolvedStyle = typeof style === 'function' ? style({ pressed: false }) : style;
    const content =
      typeof children === 'function'
        ? (children as (state: { pressed: boolean }) => React.ReactNode)({ pressed: false })
        : children;
    return React.createElement(
      'button',
      {
        ...props,
        type: 'button',
        style: resolvedStyle,
        onClick: disabled ? undefined : onPress,
        disabled,
      },
      content,
    );
  },
  Image: createComponent('img'),
  ActivityIndicator: createComponent('div'),
  StyleSheet: {
    create: <T extends Record<string, unknown>>(styles: T) => styles,
    absoluteFill: {},
  },
}));
