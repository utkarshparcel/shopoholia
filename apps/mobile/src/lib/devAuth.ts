import { sendOtp, verifyOtp } from '@/src/api/client';
import { useSessionStore } from '@/src/stores/session';

export const DEV_PHONE = '919876543210';
export const DEV_OTP = '123456';

/** Dev-only OTP sign-in using the seeded test account. No-op when already authenticated. */
export async function ensureDevAuth(): Promise<string | null> {
  if (!__DEV__) return null;

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
