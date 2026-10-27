import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Hook to detect and respond to prefers-reduced-motion
 * Returns true if user prefers reduced motion
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReduced(mediaQuery.matches);
      const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
    // On native, we could use AccessibilityInfo.isReduceMotionEnabled()
    // For now, default to false on native
    setReduced(false);
  }, []);

  return reduced;
}

/**
 * Hook to get motion-safe duration based on reduced motion preference
 */
export function useMotionDuration(
  normalDuration: number,
  reducedDuration: number = 0
): number {
  const reduced = useReducedMotion();
  return reduced ? reducedDuration : normalDuration;
}

/**
 * Hook to get motion-safe spring config
 */
export function useSpringConfig(
  normalConfig: { duration?: number; bounce?: number; dampingRatio?: number; overshootClamping?: boolean },
  reducedConfig: { duration?: number; bounce?: number; dampingRatio?: number; overshootClamping?: boolean } = { duration: 100 }
) {
  const reduced = useReducedMotion();
  return reduced ? reducedConfig : normalConfig;
}