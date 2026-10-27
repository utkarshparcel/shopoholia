import { describe, expect, it } from "vitest";
import { bootConfigProblems, resolveJwtSecret, resolveListenAddress } from "./server-env.js";

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

describe("bootConfigProblems", () => {
  const r2 = {
    R2_ACCOUNT_ID: "a",
    R2_ACCESS_KEY_ID: "k",
    R2_SECRET_ACCESS_KEY: "s",
    R2_BUCKET_NAME: "b",
  };

  it("in production, a mock storage or OCR provider is an error", () => {
    const { errors } = bootConfigProblems({ NODE_ENV: "production" });
    expect(errors).toEqual([expect.stringMatching(/R2/), expect.stringMatching(/OCR/)]);
    expect(
      bootConfigProblems({ NODE_ENV: "production", ...r2, OCR_PROVIDER_URL: "https://ocr", OCR_PROVIDER: "mock" }).errors,
    ).toEqual([expect.stringMatching(/OCR/)]);
    expect(bootConfigProblems({ NODE_ENV: "production", ...r2, OCR_PROVIDER_URL: "https://ocr" }).errors).toEqual([]);
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
      APPLE_BUNDLE_ID: "com.shopoholia.worn",
      ANDROID_PACKAGE_NAME: "com.shopoholia.worn",
      GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "a@b", private_key: "k" }),
    });
    expect(configured.warnings).toEqual([]);
    expect(
      bootConfigProblems({
        NODE_ENV: "development",
        ANDROID_PACKAGE_NAME: "com.shopoholia.worn",
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
