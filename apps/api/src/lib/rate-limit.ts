const windows = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 3600_000;
const MAX_ATTEMPTS = 5;

export function checkOtpRateLimit(phone: string): { allowed: boolean; remaining: number; resetAt: number } {
  if (process.env.NODE_ENV === "test") {
    return { allowed: true, remaining: MAX_ATTEMPTS, resetAt: Date.now() + WINDOW_MS };
  }
  const now = Date.now();
  const entry = windows.get(phone);
  if (!entry || now > entry.resetAt) {
    windows.set(phone, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1, resetAt: now + WINDOW_MS };
  }
  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }
  entry.count++;
  return { allowed: true, remaining: MAX_ATTEMPTS - entry.count, resetAt: entry.resetAt };
}

export function resetOtpRateLimit(): void {
  windows.clear();
}
