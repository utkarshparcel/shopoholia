import type { Repositories } from "../repositories/types.js";

const DEV_OTP = process.env.DEV_OTP_CODE ?? "123456";
const OTP_TTL_MS = 5 * 60_000;

export type OtpService = {
  sendOtp(phone: string): Promise<{ message: string }>;
  verifyOtp(phone: string, code: string): Promise<boolean>;
};

export function createDevOtpService(repos: Repositories): OtpService {
  return {
    async sendOtp(phone) {
      await repos.saveOtp(phone, DEV_OTP, new Date(Date.now() + OTP_TTL_MS));
      return {
        message:
          process.env.NODE_ENV === "production"
            ? "OTP sent"
            : `OTP sent (dev code: ${DEV_OTP})`,
      };
    },
    async verifyOtp(phone, code) {
      return repos.consumeOtp(phone, code);
    },
  };
}
