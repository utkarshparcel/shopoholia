/** Vitest stub for expo-haptics (native module not installed in unit test env). */
export const ImpactFeedbackStyle = {
  Light: 'light',
  Medium: 'medium',
  Heavy: 'heavy',
} as const;

export const NotificationFeedbackType = {
  Success: 'success',
  Warning: 'warning',
  Error: 'error',
} as const;

export async function impactAsync(_style: string): Promise<void> {
  // no-op
}

export async function notificationAsync(_type: string): Promise<void> {
  // no-op
}
