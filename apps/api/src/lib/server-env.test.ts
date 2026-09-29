import { describe, expect, it } from "vitest";
import { resolveJwtSecret, resolveListenAddress } from "./server-env.js";

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
