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
  captureMessage: vi.fn(),
  withScope: vi.fn((cb: (scope: { setTags: (t: Record<string, string>) => void }) => void) => {
    cb({ setTags: vi.fn() });
  }),
}));

vi.mock('expo-file-system', () => {
  class File {
    uri: string;
    exists = false;
    constructor(_cache: unknown, name: string) {
      this.uri = `file:///cache/${name}`;
    }
    create() {
      this.exists = true;
    }
    write() {}
    delete() {
      this.exists = false;
    }
  }
  return {
    File,
    Paths: { cache: 'cache://', document: 'document://' },
  };
});

vi.mock('expo-sharing', () => ({
  isAvailableAsync: vi.fn(async () => false),
  shareAsync: vi.fn(async () => undefined),
}));

vi.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  impactAsync: vi.fn(async () => undefined),
  notificationAsync: vi.fn(async () => undefined),
}));

/** The real module needs the native runtime (it throws on import here). Keys stay unique per call. */
vi.mock('expo-crypto', async () => {
  const { randomUUID } = await import('node:crypto');
  return { randomUUID: vi.fn(() => randomUUID()) };
});

/** Prevents EventEmitter crash when a test accidentally loads real api/client. */
vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { apiUrl: 'http://api.test' } } },
}));

vi.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    default: {
      getItem: async (key: string) => store.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: async (key: string) => {
        store.delete(key);
      },
      clear: async () => {
        store.clear();
      },
    },
  };
});

const createComponent =
  (tag: string) =>
  ({
    children,
    style,
    accessibilityLabel,
    testID,
    ...props
  }: React.PropsWithChildren<
    { style?: unknown; accessibilityLabel?: string; testID?: string } & Record<string, unknown>
  >) => {
    const resolvedStyle = typeof style === 'function' ? style({ pressed: false }) : style;
    return React.createElement(
      tag,
      {
        ...props,
        style: resolvedStyle,
        'aria-label': accessibilityLabel,
        'data-testid': testID,
        role: typeof props.accessibilityRole === 'string' ? props.accessibilityRole : undefined,
      },
      children,
    );
  };

vi.mock('@react-native-community/netinfo', () => ({
  default: {
    addEventListener: () => () => {},
    fetch: async () => ({ isConnected: true, isInternetReachable: true, type: 'wifi' }),
  },
  useNetInfo: () => ({
    isConnected: true,
    isInternetReachable: true,
    type: 'wifi',
  }),
}));

vi.mock('react-native', () => ({
  View: createComponent('div'),
  Text: ({
    children,
    style,
    accessibilityLabel,
    testID,
    onPress,
    ...props
  }: React.PropsWithChildren<
    {
      style?: unknown;
      accessibilityLabel?: string;
      testID?: string;
      onPress?: () => void;
    } & Record<string, unknown>
  >) => {
    const resolvedStyle = typeof style === 'function' ? style({ pressed: false }) : style;
    return React.createElement(
      onPress ? 'button' : 'span',
      {
        ...props,
        style: resolvedStyle,
        'aria-label': accessibilityLabel,
        'data-testid': testID,
        role: typeof props.accessibilityRole === 'string' ? props.accessibilityRole : undefined,
        onClick: onPress,
        type: onPress ? 'button' : undefined,
      },
      children,
    );
  },
  ScrollView: createComponent('div'),
  RefreshControl: createComponent('div'),
  TextInput: ({
    onChangeText,
    testID,
    value,
    editable,
    placeholder,
    ...props
  }: {
    onChangeText?: (text: string) => void;
    testID?: string;
    value?: string;
    editable?: boolean;
    placeholder?: string;
  } & Record<string, unknown>) =>
    React.createElement('input', {
      ...props,
      'data-testid': testID,
      value: value ?? '',
      placeholder,
      disabled: editable === false,
      onChange: (e: { target: { value: string } }) => onChangeText?.(e.target.value),
    }),
  Share: {
    share: vi.fn(async () => ({ action: 'sharedAction' })),
  },
  Pressable: ({
    children,
    onPress,
    style,
    disabled,
    accessibilityLabel,
    ...props
  }: React.PropsWithChildren<{
    onPress?: () => void;
    style?: unknown;
    disabled?: boolean;
    accessibilityLabel?: string;
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
        'aria-label': accessibilityLabel,
        style: resolvedStyle,
        onClick: disabled ? undefined : onPress,
        disabled,
      },
      content,
    );
  },
  Image: Object.assign(createComponent('img'), { prefetch: vi.fn(() => Promise.resolve(true)) }),
  ActivityIndicator: createComponent('div'),
  Modal: ({
    children,
    visible,
    testID,
    ...props
  }: React.PropsWithChildren<{
    visible?: boolean;
    testID?: string;
    transparent?: boolean;
    animationType?: string;
    onRequestClose?: () => void;
  }>) =>
    visible
      ? React.createElement('div', { ...props, 'data-testid': testID ?? 'modal', role: 'dialog' }, children)
      : null,
  PanResponder: {
    create: () => ({
      panHandlers: {},
    }),
  },
  StyleSheet: {
    create: <T extends Record<string, unknown>>(styles: T) => styles,
    absoluteFill: {},
  },
  Alert: {
    alert: vi.fn(),
  },
  Linking: {
    openURL: vi.fn(async () => true),
    canOpenURL: vi.fn(async () => true),
  },
  Platform: {
    OS: 'ios' as const,
    select: <T,>(spec: { web?: T; default?: T; ios?: T; android?: T; native?: T }) =>
      spec.ios ?? spec.native ?? spec.default,
  },
  PermissionsAndroid: {
    PERMISSIONS: { READ_SMS: 'android.permission.READ_SMS' },
    RESULTS: {
      GRANTED: 'granted',
      DENIED: 'denied',
      NEVER_ASK_AGAIN: 'never_ask_again',
    },
    request: async () => 'denied',
  },
  AccessibilityInfo: {
    isReduceMotionEnabled: async () => false,
    addEventListener: () => ({ remove: () => {} }),
  },
}));

/** Real reanimated needs native TurboModules; animations resolve to their end value. */
vi.mock('react-native-reanimated', () => {
  const identity = (t: number) => t;
  return {
    default: {
      View: createComponent('div'),
      Text: createComponent('span'),
      createAnimatedComponent: <T,>(component: T) => component,
    },
    useSharedValue: <T,>(initial: T) => ({ value: initial }),
    useAnimatedStyle: (fn: () => object) => fn(),
    withTiming: <T,>(value: T) => value,
    withSpring: <T,>(value: T) => value,
    withDelay: <T,>(_ms: number, value: T) => value,
    cancelAnimation: () => {},
    interpolate: (value: number, input: number[], output: number[]) => {
      const t = (value - input[0]) / (input[input.length - 1] - input[0] || 1);
      return output[0] + t * (output[output.length - 1] - output[0]);
    },
    Extrapolate: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    Easing: {
      linear: identity,
      ease: identity,
      bezier: () => identity,
      in: (f: typeof identity) => f,
      out: (f: typeof identity) => f,
      inOut: (f: typeof identity) => f,
    },
    runOnJS: <T,>(fn: T) => fn,
  };
});
