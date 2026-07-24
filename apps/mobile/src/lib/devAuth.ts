import { sendOtp, verifyOtp } from '@/src/api/client';
import { useSessionStore } from '@/src/stores/session';

export const DEV_PHONE = '919876543210';
export const DEV_OTP = '123456';

/**
 * Optional local auto-login. Disabled by default so Google Sign-In is the real path.
 * Set EXPO_PUBLIC_DEV_AUTO_AUTH=1 to keep the old OTP stub login in __DEV__.
 */
export async function ensureDevAuth(): Promise<string | null> {
  if (!__DEV__) return null;
  if (process.env.EXPO_PUBLIC_DEV_AUTO_AUTH !== '1') return null;

  const { accessToken, setSession } = useSessionStore.getState();
  if (accessToken) return accessToken;

  await sendOtp(DEV_PHONE);
  const tokens = await verifyOtp(DEV_PHONE, DEV_OTP);
  setSession({
    phone: DEV_PHONE,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    coinBalance: tokens.coinBalance ?? 0,
  });
  return tokens.accessToken;
}
