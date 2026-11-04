import { describe, expect, it } from "vitest";
import {
  bootConfigProblems,
  resolveCorsOrigin,
  resolveJwtSecret,
  resolveListenAddress,
  fastifyTrustProxy,
  resolveTrustProxy,
} from "./server-env.js";
import { resolveEconomyMode } from "./orders/state-machine.js";
import { appleRevocationEnv, appleSignInKeyPair } from "./auth/apple-test-support.js";

describe("resolveTrustProxy", () => {
  it("trusts the host's one proxy hop in production and nothing elsewhere", () => {
    expect(resolveTrustProxy({ NODE_ENV: "production" })).toBe(1);
    expect(resolveTrustProxy({ NODE_ENV: "development" })).toBe(false);
  });

  it("reads TRUST_PROXY as a hop count, a boolean or an address list", () => {
    expect(resolveTrustProxy({ NODE_ENV: "production", TRUST_PROXY: "2" })).toBe(2);
    expect(resolveTrustProxy({ NODE_ENV: "production", TRUST_PROXY: "false" })).toBe(false);
    expect(resolveTrustProxy({ TRUST_PROXY: "true" })).toBe(true);
    expect(resolveTrustProxy({ TRUST_PROXY: "10.0.0.0/8, 127.0.0.1" })).toBe("10.0.0.0/8, 127.0.0.1");
    expect(resolveTrustProxy({ TRUST_PROXY: "lots" })).toBeUndefined();
  });
});

describe("fastifyTrustProxy", () => {
  it("passes booleans and address lists through", () => {
    expect(fastifyTrustProxy(false)).toBe(false);
    expect(fastifyTrustProxy(undefined)).toBe(false);
    expect(fastifyTrustProxy(true)).toBe(true);
    expect(fastifyTrustProxy("10.0.0.0/8")).toBe("10.0.0.0/8");
  });

  it("turns a hop count into internal-address hops only", () => {
    const trust = fastifyTrustProxy(1) as (address: string, hop: number) => boolean;
    expect(trust("10.0.0.1", 0)).toBe(true);
    expect(trust("fdaa:0:1::2", 0)).toBe(true);
    expect(trust("100.64.3.4", 0)).toBe(true);
    expect(trust("127.0.0.1", 0)).toBe(true);
    // A second hop is beyond the count; a public peer is a client, not the host's balancer.
    expect(trust("10.0.0.2", 1)).toBe(false);
    expect(trust("203.0.113.9", 0)).toBe(false);
  });
});

describe("resolveEconomyMode", () => {
  it("runs the real delivery timers in production unless told otherwise", () => {
    expect(resolveEconomyMode({ NODE_ENV: "production" })).toBe("prod");
    expect(resolveEconomyMode({ NODE_ENV: "production", WORN_ECONOMY_MODE: "beta" })).toBe("beta");
    expect(resolveEconomyMode({ NODE_ENV: "development" })).toBe("beta");
  });
});

describe("resolveJwtSecret", () => {
  it("reads the documented JWT_ACCESS_SECRET", () => {
    expect(resolveJwtSecret({ JWT_ACCESS_SECRET: "access", JWT_SECRET: "legacy" })).toEqual({
      secret: "access",
    });
  });

  it("still accepts JWT_SECRET", () => {
    expect(resolveJwtSecret({ JWT_SECRET: "legacy" })).toEqual({ secret: "legacy" });
  });

  it("refuses to start in production without a secret", () => {
    expect(() => resolveJwtSecret({ NODE_ENV: "production" })).toThrow(
      "JWT_ACCESS_SECRET must be set in production",
    );
  });

  it("never returns an empty or blank secret", () => {
    for (const NODE_ENV of ["development", "test", undefined]) {
      const result = resolveJwtSecret({ NODE_ENV, JWT_ACCESS_SECRET: "", JWT_SECRET: "   " });
      expect(result.secret.trim()).not.toBe("");
      expect(result.warning).toMatch(/JWT_ACCESS_SECRET not set/);
    }
    expect(() => resolveJwtSecret({ NODE_ENV: "production", JWT_ACCESS_SECRET: " " })).toThrow(
      "JWT_ACCESS_SECRET must be set in production",
    );
  });

  it("falls back to a dev secret with a warning outside production", () => {
    const result = resolveJwtSecret({ NODE_ENV: "development" });
    expect(result.secret).toBeTruthy();
    expect(result.warning).toMatch(/JWT_ACCESS_SECRET not set/);
  });
});

describe("resolveListenAddress", () => {
  it("prefers the platform's PORT and HOST", () => {
    expect(
      resolveListenAddress({ PORT: "8080", HOST: "127.0.0.1", API_PORT: "4000", API_HOST: "::" }),
    ).toEqual({ port: 8080, host: "127.0.0.1" });
  });

  it("uses the documented API_PORT and API_HOST", () => {
    expect(resolveListenAddress({ API_PORT: "4000", API_HOST: "::" })).toEqual({
      port: 4000,
      host: "::",
    });
  });

  it("defaults to 0.0.0.0:3000", () => {
    expect(resolveListenAddress({})).toEqual({ port: 3000, host: "0.0.0.0" });
  });
});

describe("resolveCorsOrigin", () => {
  it("allows every origin outside production", () => {
    expect(resolveCorsOrigin({ NODE_ENV: "development", CORS_ORIGIN: "https://worncloset.app" })).toBe(
      true,
    );
    expect(resolveCorsOrigin({})).toBe(true);
  });

  it("defaults to the website in production", () => {
    expect(resolveCorsOrigin({ NODE_ENV: "production" })).toBe("https://worncloset.app");
  });

  it("reads a single origin or a comma-separated list", () => {
    expect(resolveCorsOrigin({ NODE_ENV: "production", CORS_ORIGIN: "https://worncloset.app" })).toBe(
      "https://worncloset.app",
    );
    expect(
      resolveCorsOrigin({
        NODE_ENV: "production",
        CORS_ORIGIN: "https://worncloset.app, https://www.worncloset.app,",
      }),
    ).toEqual(["https://worncloset.app", "https://www.worncloset.app"]);
  });

  it("keeps the wildcard", () => {
    expect(resolveCorsOrigin({ NODE_ENV: "production", CORS_ORIGIN: "*" })).toBe("*");
  });
});

describe("bootConfigProblems", () => {
  const r2 = {
    R2_ACCOUNT_ID: "a",
    R2_ACCESS_KEY_ID: "k",
    R2_SECRET_ACCESS_KEY: "s",
    R2_BUCKET_NAME: "b",
  };

  const db = {
    DATABASE_URL: "postgresql://worn@db/worn",
    JWT_ACCESS_SECRET: "jwt-secret",
    PRIVACY_HMAC_SECRET: "privacy-secret-16+",
  };

  it("in production, an in-memory database, missing secrets, mock storage or mock OCR is an error", () => {
    const { errors } = bootConfigProblems({ NODE_ENV: "production" });
    expect(errors).toEqual([
      expect.stringMatching(/DATABASE_URL/),
      expect.stringMatching(/JWT_ACCESS_SECRET/),
      expect.stringMatching(/PRIVACY_HMAC_SECRET/),
      expect.stringMatching(/R2/),
      expect.stringMatching(/OCR/),
    ]);
    expect(
      bootConfigProblems({ NODE_ENV: "production", ...db, ...r2, OCR_PROVIDER_URL: "https://ocr", PRIVACY_HMAC_SECRET: "short" }).errors,
    ).toEqual([expect.stringMatching(/PRIVACY_HMAC_SECRET/)]);
    expect(
      bootConfigProblems({ NODE_ENV: "production", ...db, ...r2, OCR_PROVIDER_URL: "https://ocr", TRUST_PROXY: "lots" }).errors,
    ).toEqual([expect.stringMatching(/TRUST_PROXY/)]);
    expect(
      bootConfigProblems({ NODE_ENV: "production", ...db, ...r2, OCR_PROVIDER_URL: "https://ocr", OCR_PROVIDER: "mock" }).errors,
    ).toEqual([expect.stringMatching(/OCR/)]);
    expect(
      bootConfigProblems({ NODE_ENV: "production", ...db, ...r2, OCR_PROVIDER_URL: "https://ocr" }).errors,
    ).toEqual([]);
  });

  it("in production, warns when FASHN_API_KEY is missing (try-on and reveal renders can't run)", () => {
    expect(bootConfigProblems({ NODE_ENV: "production" }).warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/FASHN_API_KEY/)]),
    );
    expect(bootConfigProblems({ NODE_ENV: "production", FASHN_API_KEY: " " }).warnings.join("\n")).toMatch(
      /FASHN_API_KEY/,
    );
    expect(bootConfigProblems({ NODE_ENV: "production", FASHN_API_KEY: "fa-live" }).warnings.join("\n")).not.toMatch(
      /FASHN_API_KEY/,
    );
    // Outside production the mock renders, so there's nothing to warn about.
    expect(bootConfigProblems({}).warnings.join("\n")).not.toMatch(/FASHN_API_KEY/);
  });

  it("in production, checks the render agent settings", () => {
    const token = "r".repeat(64);
    const warnings = (env: Record<string, string>) =>
      bootConfigProblems({ NODE_ENV: "production", ...env }).warnings.join("\n");
    // The recommended setup: agent, always, no overflow, no FASHN key. Nothing to warn about.
    const recommended = warnings({
      RENDER_BACKEND: "agent",
      RENDER_AGENT_WINDOW: "always",
      RENDER_OVERFLOW: "none",
      RENDER_AGENT_TOKEN: token,
    });
    expect(recommended).not.toMatch(/RENDER_|FASHN_API_KEY/);
    expect(warnings({ RENDER_BACKEND: "agent" })).toMatch(/RENDER_AGENT_TOKEN is not set/);
    expect(warnings({ RENDER_BACKEND: "agent", RENDER_AGENT_TOKEN: "short" })).toMatch(/RENDER_AGENT_TOKEN is short/);
    expect(warnings({ RENDER_BACKEND: "agent", RENDER_AGENT_TOKEN: token, RENDER_OVERFLOW: "fashn" })).toMatch(
      /RENDER_OVERFLOW=fashn but FASHN_API_KEY is not set/,
    );
    expect(warnings({ RENDER_BACKEND: "agent", RENDER_AGENT_TOKEN: token, RENDER_AGENT_WINDOW: "nightly" })).toMatch(
      /RENDER_AGENT_WINDOW=nightly is not understood/,
    );
    // Without the agent, the missing FASHN key points at the recommended renderer.
    expect(warnings({})).toMatch(/RENDER_BACKEND=agent/);
  });

  it("in production, warns about secrets whose routes would refuse every call", () => {
    const { warnings } = bootConfigProblems({ NODE_ENV: "production" });
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/CASHBACK_WEBHOOK_SECRET/),
        expect.stringMatching(/ADMIN_SECRET/),
      ]),
    );
    const set = bootConfigProblems({ NODE_ENV: "production", CASHBACK_WEBHOOK_SECRET: "c", ADMIN_SECRET: "a" });
    expect(set.warnings.join("\n")).not.toMatch(/CASHBACK_WEBHOOK_SECRET|ADMIN_SECRET/);
  });

  it("in production, warns about what breaks sign-in, account deletion retries, renders and App Review purchases", () => {
    const { warnings } = bootConfigProblems({ NODE_ENV: "production", IAP_ACCEPT_TEST_PURCHASES: "0" });
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/REDIS_URL is not set: .*account-deletion retries/),
        expect.stringMatching(/GOOGLE_CLIENT_IDS is not set: Google sign-in/),
        expect.stringMatching(/APPLE_BUNDLE_ID is not set: Sign in with Apple/),
        expect.stringMatching(/FASHN_API_KEY is not set/),
        expect.stringMatching(/App Review and TestFlight testers can't buy coins/),
      ]),
    );
    const set = bootConfigProblems({
      NODE_ENV: "production",
      REDIS_URL: "redis://r",
      GOOGLE_CLIENT_IDS: "a.apps.googleusercontent.com",
      APPLE_BUNDLE_ID: "app.bundle",
      FASHN_API_KEY: "k",
    });
    expect(set.warnings.join("\n")).not.toMatch(/REDIS_URL|GOOGLE_CLIENT_IDS|Sign in with Apple|FASHN_API_KEY|TestFlight/);
  });

  it("in production, warns when Apple tokens would not be revoked on account deletion", () => {
    const revocation = /Apple tokens are not revoked when an account is deleted/;
    const bundleOnly = bootConfigProblems({ NODE_ENV: "production", APPLE_BUNDLE_ID: "app.bundle" });
    expect(bundleOnly.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/APPLE_SIGN_IN_KEY_ID, APPLE_TEAM_ID or APPLE_SIGN_IN_PRIVATE_KEY/)]),
    );
    const { pem } = appleSignInKeyPair();
    const configured = {
      NODE_ENV: "production",
      OAUTH_TOKEN_SECRET: "secret",
      ...appleRevocationEnv(pem, "app.bundle"),
    };
    expect(bootConfigProblems(configured).warnings.join("\n")).not.toMatch(revocation);
    expect(bootConfigProblems({ ...configured, APPLE_SIGN_IN_PRIVATE_KEY: "nope" }).warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/not a \.p8/)]),
    );
    expect(bootConfigProblems({ ...configured, OAUTH_TOKEN_SECRET: "" }).warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/OAUTH_TOKEN_SECRET is not set/)]),
    );
    // Not without Sign in with Apple, and not outside production.
    expect(bootConfigProblems({ NODE_ENV: "production" }).warnings.join("\n")).not.toMatch(revocation);
    expect(bootConfigProblems({ NODE_ENV: "development", APPLE_BUNDLE_ID: "app.bundle" }).warnings.join("\n")).not.toMatch(
      revocation,
    );
  });

  it("in production, warns when sign-in, deletion, renders or the delivery timers would be off", () => {
    const { warnings } = bootConfigProblems({ NODE_ENV: "production", WORN_ECONOMY_MODE: "beta" });
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/GOOGLE_CLIENT_IDS/),
        expect.stringMatching(/REDIS_URL/),
        expect.stringMatching(/FASHN_API_KEY/),
        expect.stringMatching(/WORN_ECONOMY_MODE=beta/),
      ]),
    );
    expect(bootConfigProblems({ NODE_ENV: "production" }).warnings.join("\n")).not.toMatch(/WORN_ECONOMY_MODE/);
  });

  it("outside production, missing providers are not errors", () => {
    expect(bootConfigProblems({ NODE_ENV: "development" }).errors).toEqual([]);
  });

  it("names each store that will answer 503, and ignored dev flags", () => {
    const { warnings } = bootConfigProblems({ NODE_ENV: "production", IAP_ALLOW_SIMULATED: "1", FEATURE_REVENUECAT: "1" });
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/IAP_ALLOW_SIMULATED=1 is ignored/),
        expect.stringMatching(/APPLE_BUNDLE_ID .*503/),
        expect.stringMatching(/GOOGLE_PLAY_SERVICE_ACCOUNT_JSON .*503/),
        expect.stringMatching(/RevenueCat settings are no longer read/),
        expect.stringMatching(/Gmail connect is unavailable \(503\)/),
      ]),
    );
    const configured = bootConfigProblems({
      NODE_ENV: "development",
      APPLE_BUNDLE_ID: "com.worncloset.app",
      ANDROID_PACKAGE_NAME: "com.worncloset.app",
      GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "a@b", private_key: "k" }),
    });
    expect(configured.warnings).toEqual([]);
    expect(
      bootConfigProblems({
        NODE_ENV: "development",
        ANDROID_PACKAGE_NAME: "com.worncloset.app",
        GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: "{}",
        IAP_ALLOW_XCODE: "1",
      }).warnings,
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/not a service-account key/),
        expect.stringMatching(/IAP_XCODE_CERT_PEM/),
      ]),
    );
  });
});
