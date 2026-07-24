import { describe, expect, it } from "vitest";
import { verifyGoogleIdToken, verifyTestGoogleToken } from "./google.js";

describe("verifyTestGoogleToken", () => {
  it("parses deterministic test tokens", () => {
    const profile = verifyTestGoogleToken("test-google:abc:me@worn.app:Name");
    expect(profile).toEqual({
      sub: "abc",
      email: "me@worn.app",
      emailVerified: true,
      name: "Name",
      aud: "test-client",
    });
  });

  it("rejects non-test tokens", () => {
    expect(verifyTestGoogleToken("eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9")).toBeNull();
  });
});

describe("verifyGoogleIdToken", () => {
  it("uses test tokens when no GOOGLE_CLIENT_IDS in test env", async () => {
    const profile = await verifyGoogleIdToken("test-google:sub:user@example.com");
    expect(profile?.email).toBe("user@example.com");
  });

  it("validates audience against configured client ids", async () => {
    const prev = process.env.GOOGLE_CLIENT_IDS;
    process.env.GOOGLE_CLIENT_IDS = "client-a.apps.googleusercontent.com";
    try {
      const fetchImpl = async () =>
        ({
          ok: true,
          json: async () => ({
            sub: "1",
            email: "a@b.com",
            email_verified: "true",
            name: "A",
            aud: "client-a.apps.googleusercontent.com",
            iss: "https://accounts.google.com",
          }),
        }) as Response;

      const profile = await verifyGoogleIdToken("real-looking-token-value", fetchImpl);
      expect(profile?.sub).toBe("1");
    } finally {
      if (prev === undefined) delete process.env.GOOGLE_CLIENT_IDS;
      else process.env.GOOGLE_CLIENT_IDS = prev;
    }
  });
});
