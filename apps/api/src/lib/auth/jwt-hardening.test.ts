import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestServer, login } from "../../test-utils.js";

type App = Awaited<ReturnType<typeof buildTestServer>>["app"];

const b64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const now = () => Math.floor(Date.now() / 1000);

/** A compact JWT with the given header and claims, HMAC-SHA256-signed with `key` (or unsigned). */
function forge(header: Record<string, unknown>, claims: Record<string, unknown>, key?: string): string {
  const body = `${b64url(header)}.${b64url(claims)}`;
  if (key === undefined) return `${body}.`;
  return `${body}.${createHmac("sha256", key).update(body).digest("base64url")}`;
}

describe("access token verification on a protected route", () => {
  let app: App;
  let userId: string;
  let accessToken: string;
  const claims = () => ({ sub: userId, phone: "919876543210", iat: now(), exp: now() + 600 });
  // GET /avatar is behind requireAuth alone.
  const getAvatar = (token: string) =>
    app.inject({ method: "GET", url: "/avatar", headers: { authorization: `Bearer ${token}` } });

  beforeAll(async () => {
    ({ app } = await buildTestServer());
    ({ accessToken, userId } = await login(app));
  });

  afterAll(async () => {
    await app.close();
  });

  it("accepts the token sign-in issued (HS256, with an expiry)", async () => {
    const [header = ""] = accessToken.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toMatchObject({ alg: "HS256" });
    expect((app.jwt.decode(accessToken) as { exp?: number }).exp).toBeGreaterThan(now());
    expect((await getAvatar(accessToken)).statusCode).toBe(200);
  });

  it("rejects an unsigned token (alg none)", async () => {
    expect((await getAvatar(forge({ alg: "none", typ: "JWT" }, claims()))).statusCode).toBe(401);
    // The same claims claiming HS256 but with the signature stripped.
    expect((await getAvatar(forge({ alg: "HS256", typ: "JWT" }, claims()))).statusCode).toBe(401);
  });

  it("rejects a token signed with an empty key", async () => {
    expect((await getAvatar(forge({ alg: "HS256", typ: "JWT" }, claims(), ""))).statusCode).toBe(401);
  });

  it("rejects an expired token", async () => {
    const expired = forge(
      { alg: "HS256", typ: "JWT" },
      { sub: userId, phone: "919876543210", iat: now() - 3600, exp: now() - 60 },
      process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || "dev-only-change-me",
    );
    expect((await getAvatar(expired)).statusCode).toBe(401);
  });

  it("rejects a correctly signed token that carries no expiry", async () => {
    const forever = forge(
      { alg: "HS256", typ: "JWT" },
      { sub: userId, phone: "919876543210", iat: now() },
      process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || "dev-only-change-me",
    );
    expect((await getAvatar(forever)).statusCode).toBe(401);
  });

  it("rejects another HMAC algorithm even with the server's key", async () => {
    const hs512 = app.jwt.sign(claims(), { algorithm: "HS512" });
    expect((await getAvatar(hs512)).statusCode).toBe(401);
  });

  it("rejects an unknown crit header", async () => {
    const crit = forge(
      { alg: "HS256", typ: "JWT", crit: ["x-unknown"], "x-unknown": 1 },
      claims(),
      process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || "dev-only-change-me",
    );
    expect((await getAvatar(crit)).statusCode).toBe(401);
  });
});
