import { createHmac } from "node:crypto";
import type { OtpSendLimit, Repositories } from "../repositories/types.js";
import { resolveJwtSecret } from "../server-env.js";

const DEV_OTP = process.env.DEV_OTP_CODE ?? "123456";
const OTP_TTL_MS = 5 * 60_000;

/** Codes sent per phone: at most 5 in any hour. */
export const OTP_SEND_LIMIT: OtpSendLimit = { max: 5, windowMs: 3600_000 };
/** Guesses per code before it stops working. */
export const OTP_MAX_VERIFY_ATTEMPTS = 5;

/** Too many codes were sent to this phone. `retryAt` is when the next one may be sent. */
export class OtpRateLimitError extends Error {
  constructor(
    readonly retryAt: Date,
    now = Date.now(),
  ) {
    const minutes = Math.max(1, Math.ceil((retryAt.getTime() - now) / 60_000));
    super(`Too many codes sent. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`);
  }
}

/** No SMS provider is configured, so codes can't be delivered. */
export class OtpUnavailableError extends Error {
  constructor() {
    super("Phone sign-in is not available yet. Sign in with Google instead.");
  }
}

export type OtpService = {
  sendOtp(phone: string): Promise<{ message: string }>;
  verifyOtp(phone: string, code: string): Promise<boolean>;
};

/** Only an HMAC of the code is stored, bound to the phone it was sent to. */
function hashOtp(phone: string, code: string): string {
  return createHmac("sha256", resolveJwtSecret().secret).update(`${phone}:${code}`).digest("base64url");
}

/**
 * Dev OTP: every code is DEV_OTP_CODE (default 123456) and is shown in the response.
 * There is no SMS provider yet, so in production phone sign-in reports itself unavailable
 * instead of accepting a fixed code.
 *
 * Outside production nothing is texted and the code is public, so the per-phone send limit
 * only locked testers out ("Dev continue" after a few reloads); it is skipped there unless
 * `sendLimit` is passed. Production (which refuses to send above) keeps OTP_SEND_LIMIT.
 */
export function createDevOtpService(
  repos: Repositories,
  options: { sendLimit?: OtpSendLimit | null } = {},
): OtpService {
  const isProduction = () => process.env.NODE_ENV === "production";
  const sendLimit = () =>
    options.sendLimit !== undefined ? options.sendLimit : isProduction() ? OTP_SEND_LIMIT : null;

  return {
    async sendOtp(phone) {
      if (isProduction()) throw new OtpUnavailableError();
      const result = await repos.saveOtp(
        phone,
        hashOtp(phone, DEV_OTP),
        new Date(Date.now() + OTP_TTL_MS),
        sendLimit() ?? undefined,
      );
      if (!result.saved) throw new OtpRateLimitError(result.retryAt);
      return { message: `OTP sent (dev code: ${DEV_OTP})` };
    },
    async verifyOtp(phone, code) {
      if (isProduction()) return false;
      return repos.consumeOtp(phone, hashOtp(phone, code), OTP_MAX_VERIFY_ATTEMPTS);
    },
  };
}
