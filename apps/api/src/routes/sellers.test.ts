import { afterEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "../index.js";
import { sellerRoutesEnabled } from "./sellers.js";

describe("seller routes", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("are off in production unless FEATURE_SELLERS=1", () => {
    expect(sellerRoutesEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(sellerRoutesEnabled({ NODE_ENV: "production", FEATURE_SELLERS: "1" })).toBe(true);
    expect(sellerRoutesEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(sellerRoutesEnabled({ NODE_ENV: "test", FEATURE_SELLERS: "0" })).toBe(false);
  });

  it("answer 404 while off, so nobody can publish into the global feed", async () => {
    const app = await buildServer({ logger: false });
    const { user } = await app.deps.repos.createUser("919800000555");
    const auth = { authorization: `Bearer ${app.jwt.sign({ sub: user.id, phone: "x" })}` };
    vi.stubEnv("FEATURE_SELLERS", "0");
    try {
      const register = await app.inject({
        method: "POST",
        url: "/sellers/register",
        headers: auth,
        payload: { shopName: "Spam Shop" },
      });
      expect(register.statusCode).toBe(404);
      const list = await app.inject({ method: "GET", url: "/sellers/listings", headers: auth });
      expect(list.statusCode).toBe(404);
      // Everything else is unaffected.
      expect((await app.inject({ method: "GET", url: "/feed" })).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
