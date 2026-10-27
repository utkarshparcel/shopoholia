import { parseServiceAccount } from "./iap/google-play.js";
import { hasR2Config } from "./storage/r2.js";

type Env = Record<string, string | undefined>;

const DEV_JWT_SECRET = "dev-only-change-me";

/**
 * Secret for signing access tokens. JWT_ACCESS_SECRET is the documented name
 * (.env.example, @worn/config); JWT_SECRET is still read so existing setups keep working.
 */
export function resolveJwtSecret(env: Env = process.env): { secret: string; warning?: string } {
  const secret = env.JWT_ACCESS_SECRET || env.JWT_SECRET;
  if (secret) return { secret };

  if (env.NODE_ENV === "production") {
    throw new Error("JWT_ACCESS_SECRET must be set in production");
  }
  return {
    secret: DEV_JWT_SECRET,
    warning: "JWT_ACCESS_SECRET not set — using dev fallback. Do not deploy.",
  };
}

/** PORT/HOST (set by most hosting platforms) win over the documented API_PORT/API_HOST. */
export function resolveListenAddress(env: Env = process.env): { port: number; host: string } {
  return {
    port: Number(env.PORT || env.API_PORT || 3000),
    host: env.HOST || env.API_HOST || "0.0.0.0",
  };
}

/**
 * Settings that are missing or unsafe here. In production an error stops the boot: production never
 * runs on a mock. Warnings name what's unavailable (a store without settings answers 503).
 */
export function bootConfigProblems(env: Env = process.env): { errors: string[]; warnings: string[] } {
  const production = env.NODE_ENV === "production";
  const errors: string[] = [];
  const warnings: string[] = [];

  if (production) {
    if (!hasR2Config(env)) {
      errors.push("R2 storage is not configured (R2_*): uploads would go to an in-memory mock");
    }
    if (!(env.OCR_PROVIDER_URL ?? env.OCR_PROVIDER_ENDPOINT) || env.OCR_PROVIDER === "mock") {
      errors.push("OCR is not configured (OCR_PROVIDER_URL): receipts would be read by the mock");
    }
    if (!env.WEATHER_API?.trim()) {
      warnings.push("WEATHER_API is not set: weather falls back to the mock (source: mock)");
    }
    if (!env.GOOGLE_CLIENT_ID || !env.OAUTH_STATE_SECRET) {
      warnings.push("GOOGLE_CLIENT_ID or OAUTH_STATE_SECRET is not set: Gmail connect is unavailable (503)");
    }
    if (env.IAP_ALLOW_SIMULATED === "1") warnings.push("IAP_ALLOW_SIMULATED=1 is ignored in production");
    if (env.IAP_ALLOW_XCODE === "1") warnings.push("IAP_ALLOW_XCODE=1 is ignored in production");
  }

  if (!env.APPLE_BUNDLE_ID?.trim()) {
    warnings.push("APPLE_BUNDLE_ID is not set: App Store purchases are unavailable (503)");
  }
  if (!env.ANDROID_PACKAGE_NAME?.trim() || !env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) {
    warnings.push(
      "ANDROID_PACKAGE_NAME or GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not set: Google Play purchases are unavailable (503)",
    );
  } else if (!parseServiceAccount(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON)) {
    warnings.push(
      "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not a service-account key (client_email, private_key): Google Play purchases are unavailable (503)",
    );
  }
  if (!production && env.IAP_ALLOW_XCODE === "1" && !env.IAP_XCODE_CERT_PEM) {
    warnings.push("IAP_ALLOW_XCODE=1 needs IAP_XCODE_CERT_PEM (Xcode: Editor > Save Public Certificate)");
  }
  if (env.REVENUECAT_API_KEY || env.REVENUECAT_WEBHOOK_SECRET || env.FEATURE_REVENUECAT) {
    warnings.push("RevenueCat settings are no longer read: purchases are verified with Apple and Google directly");
  }
  return { errors, warnings };
}
